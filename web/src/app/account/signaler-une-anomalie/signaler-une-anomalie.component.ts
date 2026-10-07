import { Component, QueryList, ViewChild, ViewChildren, ElementRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { BsModalService, BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { Observable, take } from 'rxjs';
import { ModalDirective } from 'ngx-bootstrap/modal';
// Date Format
import { DatePipe } from '@angular/common';
import { DropzoneConfigInterface } from 'ngx-dropzone-wrapper';
import { Store } from '@ngrx/store';
import { addNoAuthbesoinData, fetchbesoinData, addNoAuthbesoinDataSuccess, addNoAuthbesoinDataFailure  } from 'src/app/store/Besoin/besoin.action';
import { selectbesoinData, selectTotalItems, selectLoading, selectCurrentPage } from 'src/app/store/Besoin/besoin-selector';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { cloneDeep } from 'lodash';

import { selectAllTypebesoinWithoutPagination } from 'src/app/store/Typebesoin/typebesoin-selector';
import { fetchtypebesoinNoPaginateData } from 'src/app/store/Typebesoin/typebesoin.action';

import { fetchuserData } from 'src/app/store/User/user.action';
import { selectuserData} from 'src/app/store/User/user-selector';
//import { selectprioriteData} from 'src/app/store/Priorite/priorite-selector';
//import { fetchprioriteData } from 'src/app/store/Priorite/priorite.action';

import { selectAllPrioritesWithoutPagination} from 'src/app/store/Priorite/priorite-selector';
import { fetchprioriteNoPaginateData } from 'src/app/store/Priorite/priorite.action';

import { Actions, ofType } from '@ngrx/effects';


@Component({
  selector: 'app-signaler-une-anomalie',
  templateUrl: './signaler-une-anomalie.component.html',
  styleUrl: './signaler-une-anomalie.component.scss',
  providers: [DecimalPipe]
})

// list Component
export class SignalerUneAnomalieComponent {

  // bread crumb items
  breadCrumbItems!: Array<{}>;

  besoins: any[] = [];
  besoinList: any[] = [];
  totalItems: number = 0;
  currentPage: number = 1;
  isLoading: boolean = true;

  besoinForm!: UntypedFormGroup;
  submitted = false;
  masterSelected!: boolean;
  term: any;
  files: File[] = [];
  checkedValGet: any[] = [];

  priorites: any[] = [];
  typebesoins: any[] = [];
  users: any[] = [];

  // Référence pour stocker l'élément qui avait le focus avant l'ouverture de la modal
  private lastActiveElement: HTMLElement | null = null;
  
  @ViewChild('addBesoin', { static: false }) addBesoin?: ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('mainContainer', { static: false }) mainContainer?: ElementRef;
  @ViewChild('viewBesoin', { static: false }) viewBesoin?: ModalDirective;
  selectedBesoin: any = null;
  deleteID: any;
  direction: any = 'asc';

  constructor(
    private formBuilder: UntypedFormBuilder, 
    private datePipe: DatePipe, 
    public toastService: ToastrService, 
    public store: Store,
    private actions$: Actions,
  ) {}

  ngOnInit(): void {
    /**
     * BreadCrumb
     */
    this.breadCrumbItems = [
      { label: 'Besoin', active: true },
      { label: 'Besoin List', active: true }
    ];

    /**
     * Form Validation
     */
    this.besoinForm = this.formBuilder.group({
      id: [''],
      //reference: ['BES-2025-024'],
      titre: ['', [Validators.required]],
      description: ['', [Validators.required]],
      //commentaire: ['', [Validators.required]],
      typebesoin: ['', [Validators.required]],
      //date_debut: ['', [Validators.required]],
      //date_fin: ['', [Validators.required]],
      //etat: ['', [Validators.required]],
      priorite: ['', [Validators.required]],
      user: ['1'],
      etat: ['1'],
      date_debut: ['2025-03-31T00:00:00Z'],
      date_fin: ['2025-04-01T00:00:00Z'],
      commentaire: ['']
    });

  

    


    // S'abonner aux données priorite
    this.store.select(selectAllPrioritesWithoutPagination).subscribe(data => {
      if (data) {
        // Initialiser correctement les états
        this.priorites = data.map(item => ({
          ...item,
          state: false
        }));
      }
    });

    // S'abonner aux données type besoin
    this.store.select(selectAllTypebesoinWithoutPagination).subscribe(data => {
      if (data) {
        // Initialiser correctement les états
        this.typebesoins = data.map(item => ({
          ...item,
          state: false
        }));
      }
    });

  

    // Charger les données initiales
    this.loadData(1);
  }

  ngAfterViewInit() {
    // Configuration de l'événement onHidden pour les modals
    if (this.addBesoin) {
      this.addBesoin.onHidden.subscribe(() => {
        // Réinitialiser le formulaire si nécessaire après fermeture
        this.besoinForm.reset();
        
        // Réinitialiser le texte du bouton et du titre
        const modaltitle = document.querySelector('.modal-title') as HTMLAreaElement;
        if (modaltitle) modaltitle.innerHTML = 'Ajouter un besoin';
        
        const modalbtn = document.getElementById('add-btn') as HTMLAreaElement;
        if (modalbtn) modalbtn.innerHTML = 'Ajouter';
      });
    }
    
    if (this.deleteRecordModal) {
      this.deleteRecordModal.onHidden.subscribe(() => {
        // Nettoyer l'état après fermeture si nécessaire
        this.deleteID = null;
      });
    }
  }

  // Charger les données avec pagination
  loadData(page: number = 1): void {

    this.store.dispatch(fetchprioriteNoPaginateData());
    this.store.dispatch(fetchtypebesoinNoPaginateData());
  }

  // Méthodes existantes
  // File Upload 
  public dropzoneConfig: DropzoneConfigInterface = {
    clickable: true,
    addRemoveLinks: true,
    previewsContainer: false,
  };

  uploadedFiles: any[] = [];

  // File Upload
  imageURL: any;
  onUploadSuccess(event: any) {
    setTimeout(() => {
      this.uploadedFiles.push(event[0]);
      // PAS besoin de besoinForm ici
    }, 1000); // 1 seconde d'attente (ou 10000 si tu veux 10 sec)
  }
  /*onUploadSuccess(event: any) {
    setTimeout(() => {
      const fileUploaded = event[0]; 
      if (fileUploaded && fileUploaded.file) {
        this.uploadedFiles.push(fileUploaded.file); // 👈 ici on pousse le vrai fichier File
      }
    }, 0);
  }*/
  

  // File Remove
  removeFile(event: any) {
    this.uploadedFiles.splice(this.uploadedFiles.indexOf(event), 1);
  }

  saveProperty() {
    if (this.besoinForm.valid) {
      const formData = new FormData();
  
      // Ajouter les champs du formulaire
      Object.entries(this.besoinForm.value).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formData.append(key, value.toString()); // 🔥 TOUJOURS convertir en string
        }
      });
  
      // Ajouter les documents correctement
      this.uploadedFiles.forEach(file => {
        formData.append('documents[]', file); // ✅ Simple liste de fichiers
      });
  
      // Debug important : voir ce qui est envoyé
      console.log([...((formData as any).entries())]);

  
      // Dispatch via NgRx
      this.store.dispatch(addNoAuthbesoinData({ newData: formData }));

       this.actions$.pipe(
                ofType(addNoAuthbesoinDataSuccess, addNoAuthbesoinDataFailure),
                take(1)
              ).subscribe(action => {
                if (action.type === addNoAuthbesoinDataSuccess.type) {
                  this.toastService.success('Le besoin a été enregistré avec succès.', 'Succès');
                  this.besoinForm.reset();
                  this.uploadedFiles = [];
                  this.addBesoin?.hide();
                } else {
                  this.toastService.error('Échec lors de l\'ajout du besoin.', 'Erreur');
                }
              });
      
    } else {
      this.toastService.error('Veuillez remplir tous les champs requis.', 'Erreur');
    }
  }
  
  
  



// Fermer la modal de détails
closeViewModal() {
  // D'abord déplacer le focus hors de la modal
  if (this.lastActiveElement) {
    this.lastActiveElement.focus();
  } else {
    document.body.focus();
  }
  
  setTimeout(() => {
    this.viewBesoin?.hide();
    this.selectedBesoin = null;
  }, 10);
}

}











