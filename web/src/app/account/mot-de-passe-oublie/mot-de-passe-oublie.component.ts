// src/app/account/mot-de-passe-oublie/mot-de-passe-oublie.component.ts
import { Component } from '@angular/core';
import { AbstractControl, UntypedFormBuilder, UntypedFormGroup, ValidationErrors, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { UserService } from 'src/app/core/services/user/user.service';

type Etape = 'matricule' | 'code' | 'mdp' | 'termine';

/** Mêmes règles que validate_password_custom côté serveur. */
const REGLES_MDP: { cle: string; libelle: string; test: (v: string) => boolean }[] = [
  { cle: 'longueur',  libelle: '8 caractères minimum',   test: v => v.length >= 8 },
  { cle: 'majuscule', libelle: 'une majuscule',          test: v => /[A-Z]/.test(v) },
  { cle: 'chiffre',   libelle: 'un chiffre',             test: v => /[0-9]/.test(v) },
  { cle: 'special',   libelle: 'un caractère spécial',   test: v => /[!@#$%^&*()\[\]{}\-_=+\\|;:'",.<>?/`~]/.test(v) },
];

function motDePasseRobuste(ctrl: AbstractControl): ValidationErrors | null {
  const v = ctrl.value || '';
  return REGLES_MDP.every(r => r.test(v)) ? null : { faible: true };
}

function confirmationIdentique(groupe: AbstractControl): ValidationErrors | null {
  return groupe.get('password')?.value === groupe.get('password2')?.value ? null : { different: true };
}

/**
 * Mot de passe oublié — 3 étapes :
 *   1. matricule  → POST users/forgot-password/  (code envoyé par SMS)
 *   2. code       → POST users/verify-code/      (renvoie un jeton)
 *   3. nouveau mot de passe → POST users/reset-password/
 */
@Component({
  selector: 'app-mot-de-passe-oublie',
  templateUrl: './mot-de-passe-oublie.component.html',
})
export class MotDePasseOublieComponent {

  etape: Etape = 'matricule';
  isLoading = false;
  errorMessage: string | null = null;
  infoMessage: string | null = null;
  fieldTextType = false;
  regles = REGLES_MDP;

  private resetToken = '';

  matriculeForm: UntypedFormGroup;
  codeForm: UntypedFormGroup;
  mdpForm: UntypedFormGroup;

  constructor(private fb: UntypedFormBuilder, private userService: UserService) {
    this.matriculeForm = this.fb.group({ username: ['', Validators.required] });
    this.codeForm = this.fb.group({ code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]] });
    this.mdpForm = this.fb.group(
      { password: ['', [Validators.required, motDePasseRobuste]], password2: ['', Validators.required] },
      { validators: confirmationIdentique },
    );
  }

  get username(): string { return (this.matriculeForm.value.username || '').trim(); }

  regleOk(test: (v: string) => boolean): boolean { return test(this.mdpForm.value.password || ''); }

  demanderCode(): void {
    this.matriculeForm.markAllAsTouched();
    if (this.matriculeForm.invalid || this.isLoading) return;
    this._appel();
    this.userService.demanderCodeReinitialisation(this.username)
      .pipe(finalize(() => this.isLoading = false))
      .subscribe({
        next: res => {
          this.infoMessage = res.contact_masque
            ? `Si ce compte existe, un code a été envoyé par SMS au ${res.contact_masque}.`
            : res.message;
          this.codeForm.reset();
          this.etape = 'code';
        },
        error: err => this.errorMessage = this._texte(err),
      });
  }

  verifierCode(): void {
    this.codeForm.markAllAsTouched();
    if (this.codeForm.invalid || this.isLoading) return;
    this._appel();
    this.userService.verifierCodeReinitialisation(this.username, this.codeForm.value.code.trim())
      .pipe(finalize(() => this.isLoading = false))
      .subscribe({
        next: res => {
          this.resetToken = res.reset_token;
          this.infoMessage = null;
          this.etape = 'mdp';
        },
        error: err => this.errorMessage = this._texte(err),
      });
  }

  reinitialiser(): void {
    this.mdpForm.markAllAsTouched();
    if (this.mdpForm.invalid || this.isLoading) return;
    this._appel();
    this.userService.reinitialiserMotDePasse(this.username, this.resetToken, this.mdpForm.value.password)
      .pipe(finalize(() => this.isLoading = false))
      .subscribe({
        next: () => {
          this.resetToken = '';
          this.etape = 'termine';
        },
        error: err => {
          this.errorMessage = this._texte(err);
          // Jeton expiré : il faut redemander un code
          if (/expirée|Recommencez/i.test(this.errorMessage)) this.recommencer(this.errorMessage);
        },
      });
  }

  recommencer(message: string | null = null): void {
    this.resetToken = '';
    this.codeForm.reset();
    this.mdpForm.reset();
    this.infoMessage = null;
    this.errorMessage = message;
    this.etape = 'matricule';
  }

  private _appel(): void {
    this.isLoading = true;
    this.errorMessage = null;
  }

  private _texte(err: any): string {
    return typeof err === 'string' ? err : 'Une erreur est survenue. Réessayez.';
  }
}
