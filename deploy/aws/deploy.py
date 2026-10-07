#!/usr/bin/env python3
"""
Déploiement d'Ubifood sur AWS EC2 (backend Django, site Angular, PostgreSQL).

Tout passe par l'API AWS : pas de clé SSH ni de port 22 ouvert. Les commandes
sont exécutées sur l'instance via AWS Systems Manager (SSM) et les secrets
sont stockés chiffrés dans SSM Parameter Store (/ubifood/...).

Prérequis : pip install boto3 ; identifiants AWS dans l'environnement
(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION).

    python deploy.py create  [--instance-type t3.small] [--branch main]
                             [--firebase-key chemin.json] [--domain api.exemple.com]
    python deploy.py update  [--branch main]     # redéploie la dernière version du code
    python deploy.py status
    python deploy.py secrets [--firebase-key ...] [--domain ...]
                             (+ variables UBIFOOD_ALLMYSMS_LOGIN / UBIFOOD_ALLMYSMS_API_KEY)

Ressources créées (toutes nommées « ubifood ») : rôle IAM + profil d'instance,
groupe de sécurité (ports 80 et 443), adresse IP élastique, instance EC2
Ubuntu 24.04 avec disque gp3 chiffré, paramètres SSM.
"""

import argparse
import json
import os
import secrets
import sys
import time

import boto3
from botocore.exceptions import ClientError

NOM = 'ubifood'
DEPOT = 'https://github.com/gbohi/ubifood.git'
PREFIXE_SSM = '/ubifood/'
AMI_UBUNTU = '/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id'
TAGS = [{'Key': 'Name', 'Value': NOM}, {'Key': 'Projet', 'Value': NOM}]


def log(msg):
    print(msg, flush=True)


class Deployeur:

    def __init__(self, region):
        session = boto3.session.Session(region_name=region)
        self.region = session.region_name
        if not self.region:
            sys.exit("Région AWS inconnue : définir AWS_DEFAULT_REGION ou --region.")
        self.ec2 = session.client('ec2')
        self.iam = session.client('iam')
        self.ssm = session.client('ssm')
        self.sts = session.client('sts')

    # ── Vérification des identifiants ─────────────────────────
    def identite(self):
        ident = self.sts.get_caller_identity()
        log(f"Compte AWS {ident['Account']} — {ident['Arn']} — région {self.region}")

    # ── IAM : rôle permettant à l'instance d'utiliser SSM ─────
    def role_instance(self):
        confiance = {
            'Version': '2012-10-17',
            'Statement': [{'Effect': 'Allow', 'Principal': {'Service': 'ec2.amazonaws.com'},
                           'Action': 'sts:AssumeRole'}],
        }
        try:
            self.iam.create_role(RoleName=NOM, AssumeRolePolicyDocument=json.dumps(confiance),
                                 Description='Instance EC2 Ubifood (SSM)', Tags=TAGS)
            log("Rôle IAM créé.")
        except ClientError as e:
            if e.response['Error']['Code'] != 'EntityAlreadyExists':
                raise
        self.iam.attach_role_policy(
            RoleName=NOM, PolicyArn='arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore')
        # Lecture des seuls paramètres /ubifood/*
        compte = self.sts.get_caller_identity()['Account']
        self.iam.put_role_policy(RoleName=NOM, PolicyName='lecture-parametres-ubifood',
                                 PolicyDocument=json.dumps({
                                     'Version': '2012-10-17',
                                     'Statement': [{
                                         'Effect': 'Allow',
                                         'Action': ['ssm:GetParameter', 'ssm:GetParameters',
                                                    'ssm:GetParametersByPath'],
                                         'Resource': f'arn:aws:ssm:{self.region}:{compte}:parameter/ubifood/*',
                                     }],
                                 }))
        try:
            self.iam.create_instance_profile(InstanceProfileName=NOM, Tags=TAGS)
            self.iam.add_role_to_instance_profile(InstanceProfileName=NOM, RoleName=NOM)
            log("Profil d'instance créé (propagation IAM : ~15 s).")
            time.sleep(15)
        except ClientError as e:
            if e.response['Error']['Code'] != 'EntityAlreadyExists':
                raise

    # ── Réseau ────────────────────────────────────────────────
    def groupe_securite(self):
        vpcs = self.ec2.describe_vpcs(Filters=[{'Name': 'is-default', 'Values': ['true']}])['Vpcs']
        if not vpcs:
            sys.exit("Aucun VPC par défaut dans cette région.")
        vpc_id = vpcs[0]['VpcId']
        existants = self.ec2.describe_security_groups(Filters=[
            {'Name': 'group-name', 'Values': [NOM]}, {'Name': 'vpc-id', 'Values': [vpc_id]}])['SecurityGroups']
        if existants:
            return existants[0]['GroupId']
        sg_id = self.ec2.create_security_group(
            GroupName=NOM, Description='Ubifood : HTTP et HTTPS publics', VpcId=vpc_id,
            TagSpecifications=[{'ResourceType': 'security-group', 'Tags': TAGS}])['GroupId']
        self.ec2.authorize_security_group_ingress(GroupId=sg_id, IpPermissions=[
            {'IpProtocol': 'tcp', 'FromPort': p, 'ToPort': p,
             'IpRanges': [{'CidrIp': '0.0.0.0/0'}], 'Ipv6Ranges': [{'CidrIpv6': '::/0'}]}
            for p in (80, 443)
        ])
        log("Groupe de sécurité créé (80, 443). Pas de port 22 : accès admin via SSM.")
        return sg_id

    def ip_elastique(self):
        adresses = self.ec2.describe_addresses(Filters=[{'Name': 'tag:Name', 'Values': [NOM]}])['Addresses']
        if adresses:
            return adresses[0]
        alloc = self.ec2.allocate_address(Domain='vpc', TagSpecifications=[
            {'ResourceType': 'elastic-ip', 'Tags': TAGS}])
        log(f"Adresse IP élastique réservée : {alloc['PublicIp']}")
        return self.ec2.describe_addresses(AllocationIds=[alloc['AllocationId']])['Addresses'][0]

    # ── Secrets (SSM Parameter Store, chiffrés) ───────────────
    def _param(self, nom, valeur, ecraser):
        try:
            self.ssm.put_parameter(Name=PREFIXE_SSM + nom, Value=valeur, Type='SecureString',
                                   Overwrite=ecraser, Tier='Standard')
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == 'ParameterAlreadyExists':
                return False
            raise

    def secrets(self, firebase_key=None, domaine=None):
        # Générés une seule fois, jamais écrasés
        for nom, valeur in (('SECRET_KEY', secrets.token_urlsafe(50)),
                            ('DB_PASSWORD', secrets.token_urlsafe(24)),
                            ('ADMIN_PASSWORD', secrets.token_urlsafe(12) + 'A1!')):
            if self._param(nom, valeur, ecraser=False):
                log(f"Secret {nom} généré.")
        # Fournis par l'utilisateur (écrasés s'ils sont redonnés)
        if firebase_key:
            with open(firebase_key, encoding='utf-8') as f:
                contenu = f.read()
            json.loads(contenu)  # vérifie que c'est bien un JSON
            self._param('FIREBASE_KEY', contenu, ecraser=True)
            log("Clé Firebase enregistrée.")
        if domaine:
            self._param('DOMAIN', domaine, ecraser=True)
        for nom in ('ALLMYSMS_LOGIN', 'ALLMYSMS_API_KEY'):
            valeur = os.environ.get(f'UBIFOOD_{nom}')
            if valeur:
                self._param(nom, valeur, ecraser=True)
                log(f"{nom} enregistré.")

    # ── Instance ──────────────────────────────────────────────
    def instance_existante(self):
        res = self.ec2.describe_instances(Filters=[
            {'Name': 'tag:Name', 'Values': [NOM]},
            {'Name': 'instance-state-name', 'Values': ['pending', 'running', 'stopping', 'stopped']},
        ])['Reservations']
        return res[0]['Instances'][0] if res else None

    def creer_instance(self, sg_id, type_instance):
        ami = self.ssm.get_parameter(Name=AMI_UBUNTU)['Parameter']['Value']
        inst = self.ec2.run_instances(
            ImageId=ami, InstanceType=type_instance, MinCount=1, MaxCount=1,
            SecurityGroupIds=[sg_id],
            IamInstanceProfile={'Name': NOM},
            MetadataOptions={'HttpTokens': 'required', 'HttpEndpoint': 'enabled'},
            BlockDeviceMappings=[{'DeviceName': '/dev/sda1', 'Ebs': {
                'VolumeSize': 30, 'VolumeType': 'gp3', 'Encrypted': True, 'DeleteOnTermination': False}}],
            TagSpecifications=[{'ResourceType': 'instance', 'Tags': TAGS},
                               {'ResourceType': 'volume', 'Tags': TAGS}],
        )['Instances'][0]
        log(f"Instance {inst['InstanceId']} ({type_instance}) en cours de démarrage…")
        self.ec2.get_waiter('instance_running').wait(InstanceIds=[inst['InstanceId']])
        return self.ec2.describe_instances(InstanceIds=[inst['InstanceId']])['Reservations'][0]['Instances'][0]

    def attendre_ssm(self, instance_id, delai=600):
        log("Attente de l'agent SSM sur l'instance…")
        fin = time.time() + delai
        while time.time() < fin:
            info = self.ssm.describe_instance_information(
                Filters=[{'Key': 'InstanceIds', 'Values': [instance_id]}])['InstanceInformationList']
            if info and info[0]['PingStatus'] == 'Online':
                return
            time.sleep(10)
        sys.exit("L'instance ne s'est pas enregistrée auprès de SSM (rôle IAM ? accès Internet ?).")

    def executer(self, instance_id, commandes, delai=3600):
        cmd = self.ssm.send_command(
            InstanceIds=[instance_id], DocumentName='AWS-RunShellScript',
            Parameters={'commands': commandes, 'executionTimeout': [str(delai)]},
            Comment='Déploiement Ubifood', TimeoutSeconds=600,
        )['Command']['CommandId']
        log(f"Commande SSM {cmd} lancée (le premier build prend 10 à 20 min)…")
        while True:
            time.sleep(15)
            try:
                inv = self.ssm.get_command_invocation(CommandId=cmd, InstanceId=instance_id)
            except ClientError as e:
                if e.response['Error']['Code'] == 'InvocationDoesNotExist':
                    continue
                raise
            if inv['Status'] not in ('Pending', 'InProgress', 'Delayed'):
                break
        log(inv.get('StandardOutputContent', '')[-6000:])
        if inv.get('StandardErrorContent'):
            log(inv['StandardErrorContent'][-3000:])
        if inv['Status'] != 'Success':
            sys.exit(f"❌ Déploiement en échec ({inv['Status']}). Journal complet sur l'instance : "
                     "/var/log/ubifood-deploy.log")

    def installer(self, instance_id, ip, branche):
        self.executer(instance_id, [
            'set -e',
            'command -v git >/dev/null || (apt-get update -q && apt-get install -y -q git)',
            'if [ ! -d /opt/ubifood/.git ]; then '
            f'git clone -q -b {branche} {DEPOT} /opt/ubifood; '
            f'else cd /opt/ubifood && git fetch -q origin {branche} && git checkout -q {branche} '
            f'&& git reset -q --hard origin/{branche}; fi',
            f'bash /opt/ubifood/deploy/aws/server-setup.sh {self.region} {ip} '
            '> /var/log/ubifood-deploy.log 2>&1 || { tail -80 /var/log/ubifood-deploy.log; exit 1; }',
            'tail -40 /var/log/ubifood-deploy.log',
        ])

    # ── Commandes ─────────────────────────────────────────────
    def create(self, type_instance, branche, firebase_key, domaine):
        self.identite()
        self.role_instance()
        sg_id = self.groupe_securite()
        self.secrets(firebase_key, domaine)
        eip = self.ip_elastique()
        inst = self.instance_existante()
        if inst:
            log(f"Instance existante réutilisée : {inst['InstanceId']}")
            if inst['State']['Name'] == 'stopped':
                self.ec2.start_instances(InstanceIds=[inst['InstanceId']])
                self.ec2.get_waiter('instance_running').wait(InstanceIds=[inst['InstanceId']])
        else:
            inst = self.creer_instance(sg_id, type_instance)
        if eip.get('InstanceId') != inst['InstanceId']:
            self.ec2.associate_address(AllocationId=eip['AllocationId'], InstanceId=inst['InstanceId'])
        self.attendre_ssm(inst['InstanceId'])
        self.installer(inst['InstanceId'], eip['PublicIp'], branche)
        self.resume(eip['PublicIp'])

    def update(self, branche):
        self.identite()
        inst = self.instance_existante()
        if not inst:
            sys.exit("Aucune instance « ubifood » : lancer d'abord « deploy.py create ».")
        eip = self.ip_elastique()
        self.installer(inst['InstanceId'], eip['PublicIp'], branche)
        self.resume(eip['PublicIp'])

    def status(self):
        self.identite()
        inst = self.instance_existante()
        if not inst:
            log("Aucune instance « ubifood ».")
            return
        log(f"Instance {inst['InstanceId']} {inst['InstanceType']} : {inst['State']['Name']}, "
            f"IP {inst.get('PublicIpAddress', '—')}")

    def resume(self, ip):
        log(f"""
✅ Ubifood est en ligne
   Site web        : http://{ip}
   API             : http://{ip}/api/api/
   Admin Django    : http://{ip}/admin/
   Identifiant     : admin
   Mot de passe    : AWS Console → Systems Manager → Parameter Store → /ubifood/ADMIN_PASSWORD
   Application mobile : mettre http://{ip} dans mobile/lib/core/config.dart
   Console serveur : AWS Console → EC2 → instance « ubifood » → Se connecter → Session Manager
""")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('action', choices=['create', 'update', 'status', 'secrets'])
    parser.add_argument('--region', default=None)
    parser.add_argument('--instance-type', default='t3.small')
    parser.add_argument('--branch', default='main')
    parser.add_argument('--firebase-key', help='Fichier firebase-service-account.json')
    parser.add_argument('--domain', help="Nom de domaine pointant sur l'IP (optionnel)")
    args = parser.parse_args()

    d = Deployeur(args.region)
    if args.action == 'create':
        d.create(args.instance_type, args.branch, args.firebase_key, args.domain)
    elif args.action == 'update':
        d.update(args.branch)
    elif args.action == 'status':
        d.status()
    elif args.action == 'secrets':
        d.identite()
        d.secrets(args.firebase_key, args.domain)


if __name__ == '__main__':
    main()
