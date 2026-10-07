import { Component, QueryList, ViewChild, ViewChildren, ElementRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { BsModalService, BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { Observable } from 'rxjs';
import { ModalDirective } from 'ngx-bootstrap/modal';
// Date Format
import { DatePipe } from '@angular/common';
import { DropzoneConfigInterface } from 'ngx-dropzone-wrapper';
import { Store } from '@ngrx/store';
import { addtypeequipeData, deletetypeequipeData, deletemultipletypeequipeData, fetchtypeequipeData, updatetypeequipeData } from 'src/app/store/Typeequipe/typeequipe.action';
import { selecttypeequipeData, selectTotalItems, selectLoading, selectCurrentPage } from 'src/app/store/Typeequipe/typeequipe-selector';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { cloneDeep } from 'lodash';


@Component({
  selector: 'app-typeequipe',
  templateUrl: './typeequipe.component.html',
  styleUrl: './typeequipe.component.scss',
  providers: [DecimalPipe]
})

// list Component
export class TypeequipeComponent {

  // bread crumb items
  breadCrumbItems!: Array<{}>;

  typeequipes: any[] = [];
  typeequipeList: any[] = [];
  totalItems: number = 0;
  currentPage: number = 1;
  isLoading: boolean = true;

  typeequipeForm!: UntypedFormGroup;
  submitted = false;
  masterSelected!: boolean;
  term: any;
  files: File[] = [];
  checkedValGet: any[] = [];

  // Référence pour stocker l'élément qui avait le focus avant l'ouverture de la modal
  private lastActiveElement: HTMLElement | null = null;
  
  @ViewChild('addTypeequipe', { static: false }) addTypeequipe?: ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('mainContainer', { static: false }) mainContainer?: ElementRef;
  @ViewChild('viewTypeequipe', { static: false }) viewTypeequipe?: ModalDirective;
  selectedTypeequipe: any = null;
  deleteID: any;
  direction: any = 'asc';

  constructor(
    private formBuilder: UntypedFormBuilder, 
    private datePipe: DatePipe, 
    public toastService: ToastrService, 
    public store: Store
  ) {}

  ngOnInit(): void {
    /**
     * BreadCrumb
     */
    this.breadCrumbItems = [
      { label: 'Typeequipes', active: true },
      { label: 'Typeequipe List', active: true }
    ];

    /**
     * Form Validation
     */
    this.typeequipeForm = this.formBuilder.group({
      id: [''],
      libelle: ['', [Validators.required]]
    });

    // S'abonner à l'état de chargement
    this.store.select(selectLoading).subscribe(loading => {
      this.isLoading = loading;
      if (!loading) {
        document.getElementById('elmLoader')?.classList.add('d-none');
      } else {
        document.getElementById('elmLoader')?.classList.remove('d-none');
      }
    });

    // S'abonner au nombre total d'éléments
    this.store.select(selectTotalItems).subscribe(total => {
      this.totalItems = total || 0;
    });

    // S'abonner à la page actuelle
    this.store.select(selectCurrentPage).subscribe(page => {
      this.currentPage = page || 1;
    });

    // S'abonner aux données
    this.store.select(selecttypeequipeData).subscribe(data => {
      if (data) {
        // Initialiser correctement les états
        this.typeequipes = data.map(item => ({
          ...item,
          state: false
        }));
        this.typeequipeList = [...this.typeequipes];
        this.updateNoResultDisplay();
      }
    });

    // Charger les données initiales
    this.loadData(1);
  }

  ngAfterViewInit() {
    // Configuration de l'événement onHidden pour les modals
    if (this.addTypeequipe) {
      this.addTypeequipe.onHidden.subscribe(() => {
        // Réinitialiser le formulaire si nécessaire après fermeture
        this.typeequipeForm.reset();
        
        // Réinitialiser le texte du bouton et du titre
        const modaltitle = document.querySelector('.modal-title') as HTMLAreaElement;
        if (modaltitle) modaltitle.innerHTML = 'Ajouter un typeequipe';
        
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
    this.store.dispatch(fetchtypeequipeData({ page }));
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
      this.typeequipeForm.controls['img'].setValue(event[0].dataURL);
    }, 0);
  }

  // File Remove
  removeFile(event: any) {
    this.uploadedFiles.splice(this.uploadedFiles.indexOf(event), 1);
  }

  // Ouverture de la modal d'ajout
  openAddModal() {
    // Stocker l'élément actif avant d'ouvrir la modal
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.addTypeequipe?.show();
    const modaltitle = document.querySelector('.modal-title') as HTMLAreaElement;
    modaltitle.innerHTML = 'Ajouter un typeequipe';
    const modalbtn = document.getElementById('add-btn') as HTMLAreaElement;
    modalbtn.innerHTML = 'Ajouter';
    
    // Réinitialiser le formulaire
    this.typeequipeForm.reset();
  }

  // Fermeture de la modal d'ajout
  /*closeAddModal() {
    this.addTypeequipe?.hide();
    
    // Réinitialiser le texte du bouton et du titre pour la prochaine utilisation
    const modaltitle = document.querySelector('.modal-title') as HTMLAreaElement;
    if (modaltitle) modaltitle.innerHTML = 'Ajouter un typeequipe';
    
    const modalbtn = document.getElementById('add-btn') as HTMLAreaElement;
    if (modalbtn) modalbtn.innerHTML = 'Ajouter';
    
    // Rediriger le focus vers l'élément précédemment actif
    setTimeout(() => {
      if (this.lastActiveElement) {
        this.lastActiveElement.focus();
      }
    }, 100);
    this.typeequipeForm.reset();
  }*/

  closeAddModal() {
    // D'abord déplacer le focus hors de la modal avant de la fermer
    if (this.lastActiveElement) {
      this.lastActiveElement.focus();
    } else {
      // Fallback si lastActiveElement n'est pas défini
      document.body.focus();
    }
    
    // Petite pause pour s'assurer que le focus est bien déplacé
    setTimeout(() => {
      this.addTypeequipe?.hide();
      
      // Réinitialiser le texte du bouton et du titre
      const modaltitle = document.querySelector('.modal-title') as HTMLAreaElement;
      if (modaltitle) modaltitle.innerHTML = 'Ajouter un typeequipe';
      
      const modalbtn = document.getElementById('add-btn') as HTMLAreaElement;
      if (modalbtn) modalbtn.innerHTML = 'Ajouter';
    }, 10);
  }

  // Edit Data
  editList(id: any) {
    // Stocker l'élément actif avant d'ouvrir la modal
    this.lastActiveElement = document.activeElement as HTMLElement;
    
    this.addTypeequipe?.show();
    const modaltitle = document.querySelector('.modal-title') as HTMLAreaElement;
    modaltitle.innerHTML = 'Modifier le typeequipe';
    const modalbtn = document.getElementById('add-btn') as HTMLAreaElement;
    modalbtn.innerHTML = 'Mettre à jour';
    
    // Trouver l'élément par index ou id
    const editData = typeof id === 'number' ? this.typeequipes[id] : this.typeequipes.find(p => p.id === id);
    
    if (editData) {
      if (this.uploadedFiles.length > 0) {
        this.uploadedFiles = [];  // Vider d'abord
      }
      if (editData.img) {
        this.uploadedFiles.push({ 'dataURL': editData.img, 'name': editData.imgalt, 'size': 1024 });
      }
      this.typeequipeForm.patchValue(editData);
    }
  }

  // Add/Update Property
  saveProperty() {
    if (this.typeequipeForm.valid) {
      let formValue = { ...this.typeequipeForm.value };
  
      // Si `id` est vide, on le supprime avant d'envoyer les données
      if (!formValue.id) {
        delete formValue.id;
      }
  
      // Si l'ID existe, on met à jour les données, sinon on les ajoute
      if (this.typeequipeForm.get('id')?.value) {
        // L'ID existe, donc on met à jour
        const updatedData = formValue;
        this.store.dispatch(updatetypeequipeData({ updatedData }));
        this.toastService.success('Typebeoin mis à jour avec succès !', 'Succès');
      } else {
        // L'ID est vide, on crée une nouvelle entrée
        const newData = formValue;
        this.store.dispatch(addtypeequipeData({ newData }));
        this.toastService.success('Typeequipe ajouté avec succès !', 'Succès');
      }
  
      // Réinitialisation de l'interface
      this.uploadedFiles = [];
      this.typeequipeForm.reset();
  
      // Fermeture du modal
      this.closeAddModal();
    } else {
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
    }
  }
  
  // Delete Product
  removeItem(id: any) {
    // Stocker l'élément actif avant d'ouvrir la modal
    this.lastActiveElement = document.activeElement as HTMLElement;
    
    this.deleteID = id;
    this.deleteRecordModal?.show();
  }

  // Fermeture de la modal de suppression
  /*closeDeleteModal() {
    this.deleteRecordModal?.hide();
    // Rediriger le focus vers l'élément précédemment actif ou vers un élément visible
    setTimeout(() => {
      if (this.lastActiveElement) {
        this.lastActiveElement.focus();
      } else {
        // Fallback si lastActiveElement n'est pas défini
        const visibleElement = this.mainContainer?.nativeElement.querySelector('button');
        if (visibleElement) {
          visibleElement.focus();
        }
      }
    }, 100);
  }*/

    closeDeleteModal() {
      // D'abord déplacer le focus hors de la modal
      if (this.lastActiveElement) {
        this.lastActiveElement.focus();
      } else {
        document.body.focus();
      }
      
      setTimeout(() => {
        this.deleteRecordModal?.hide();
      }, 10);
    }

  // Suppression avec confirmation
confirmDelete(id?: any) {
  if (id) {
    // Suppression d'un élément spécifique
    this.store.dispatch(deletetypeequipeData({ id: id.toString() }));
    this.toastService.success('Type equipe supprimé avec succès !', 'Succès');
    // Mettre à jour l'UI
    this.afterDeleteActions();
    return;
  }

  if (this.checkedValGet && this.checkedValGet.length > 0) {
    // Suppression multiple
    console.log("IDs à supprimer :", this.checkedValGet);
    this.store.dispatch(deletemultipletypeequipeData({ id: this.checkedValGet.join(',') }));
    this.toastService.success('Type equipe supprimées avec succès !', 'Succès');
    
    // Mettre à jour l'UI
    this.afterDeleteActions();
    return;
  }

  // Aucun élément sélectionné
  this.toastService.error('Aucun type equipe sélectionné pour suppression.', 'Erreur');
  this.closeDeleteModal();
}

// Actions à effectuer après une suppression
private afterDeleteActions() {
  this.closeDeleteModal();
  this.masterSelected = false;
  this.deleteID = null;
  this.checkedValGet = []; // Réinitialisation des éléments sélectionnés
}


  // Réinitialiser les cases à cocher
  resetCheckboxes() {
    if (this.typeequipes) {
      this.typeequipes.forEach((item: any) => {
        if (item) item.state = false;
      });
    }
    this.checkedValGet = [];
    
    // Réinitialiser également la case à cocher "Tout sélectionner"
    const selectAllCheckbox = document.querySelector('#select-all-checkbox') as HTMLInputElement;
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
    }
  }

  // The master checkbox will check/uncheck all items
  checkUncheckAll(ev: any) {
    // S'assurer que typeequipe est défini
    if (!this.typeequipes) return;
    
    // Mettre à jour l'état de tous les éléments
    this.typeequipes.forEach((x: any) => {
      if (x) {
        x.state = ev.target.checked;
      }
    });
    
    // Mettre à jour masterSelected
    this.masterSelected = ev.target.checked;
    
    // Recalculer checkedValGet
    this.updateCheckedValues();
  }

  // Select Checkbox value Get
  onCheckboxChange(e: any) {
    // Recalculer checkedValGet
    this.updateCheckedValues();
  }

  // Méthode utilitaire pour mettre à jour checkedValGet
  private updateCheckedValues() {
    const checkedVal: any[] = [];
    
    if (this.typeequipes && this.typeequipes.length > 0) {
      for (let i = 0; i < this.typeequipes.length; i++) {
        if (this.typeequipes[i] && this.typeequipes[i].state === true) {
          checkedVal.push(this.typeequipes[i].id);
        }
      }
    }
    
    this.checkedValGet = checkedVal;
    console.log('Éléments cochés:', this.checkedValGet);
  }

  // Sort Data
  onSort(column: any) {
    if (this.direction == 'asc') {
      this.direction = 'desc';
    } else {
      this.direction = 'asc';
    }
    const sortedArray = [...this.typeequipes]; // Create a new array
    sortedArray.sort((a, b) => {
      const res = this.compare(a[column], b[column]);
      return this.direction === 'asc' ? res : -res;
    });
    this.typeequipes = sortedArray;
  }
  
  compare(v1: string | number, v2: string | number) {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
  }

  // filterdata
  filterdata() {
    if (this.term) {
      this.typeequipes = this.typeequipeList.filter((el: any) => 
        el.libelle?.toLowerCase().includes(this.term.toLowerCase()) || 
        el.id?.toString().includes(this.term)
      );
    } else {
      // Recharger les données du serveur si pas de terme de recherche
      this.loadData(this.currentPage);
    }
    // noResultElement
    this.updateNoResultDisplay();
  }

  // no result 
  updateNoResultDisplay() {
    const noResultElement = document.querySelector('.noresult') as HTMLElement;
    if (!noResultElement) return;

    if (this.term && this.typeequipes.length === 0) {
      noResultElement.style.display = 'block';
    } else {
      noResultElement.style.display = 'none';
    }
  }

  // Page Changed
  pageChanged(event: PageChangedEvent): void {
    this.loadData(event.page);
  }

  // Ouvrir la modal de détails
viewDetails(id: any) {
  // Stocker l'élément actif avant d'ouvrir la modal
  this.lastActiveElement = document.activeElement as HTMLElement;
  
  // Trouver l'élément par ID
  const typeequipeData = this.typeequipes.find(p => p.id === id);
  
  if (typeequipeData) {
    this.selectedTypeequipe = typeequipeData;
    this.viewTypeequipe?.show();
  } else {
    this.toastService.error('Departement introuvable', 'Erreur');
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
    this.viewTypeequipe?.hide();
    this.selectedTypeequipe = null;
  }, 10);
}

}

