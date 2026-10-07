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
import { addtypeplatData, deletetypeplatData, deletemultipletypeplatData, fetchtypeplatData, updatetypeplatData } from 'src/app/store/Typeplat/typeplat.action';
import { selecttypeplatData, selectTotalItems, selectLoading, selectCurrentPage } from 'src/app/store/Typeplat/typeplat-selector';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { cloneDeep } from 'lodash';


@Component({
  selector: 'app-typeplat',
  templateUrl: './typeplat.component.html',
  styleUrl: './typeplat.component.scss',
  providers: [DecimalPipe]
})

// list Component
export class TypeplatComponent {

  // bread crumb items
  breadCrumbItems!: Array<{}>;

  typeplats: any[] = [];
  typeplatList: any[] = [];
  totalItems: number = 0;
  currentPage: number = 1;
  isLoading: boolean = true;

  typeplatForm!: UntypedFormGroup;
  submitted = false;
  masterSelected!: boolean;
  term: any;
  files: File[] = [];
  checkedValGet: any[] = [];

  // Référence pour stocker l'élément qui avait le focus avant l'ouverture de la modal
  private lastActiveElement: HTMLElement | null = null;
  
  @ViewChild('addTypeplat', { static: false }) addTypeplat?: ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('mainContainer', { static: false }) mainContainer?: ElementRef;
  @ViewChild('viewTypeplat', { static: false }) viewTypeplat?: ModalDirective;
  selectedTypeplat: any = null;
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
      { label: 'Typeplats', active: true },
      { label: 'Typeplat List', active: true }
    ];

    /**
     * Form Validation
     */
    this.typeplatForm = this.formBuilder.group({
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
    this.store.select(selecttypeplatData).subscribe(data => {
      if (data) {
        // Initialiser correctement les états
        this.typeplats = data.map(item => ({
          ...item,
          state: false
        }));
        this.typeplatList = [...this.typeplats];
        this.updateNoResultDisplay();
      }
    });

    // Charger les données initiales
    this.loadData(1);
  }

  ngAfterViewInit() {
    // Configuration de l'événement onHidden pour les modals
    if (this.addTypeplat) {
      this.addTypeplat.onHidden.subscribe(() => {
        // Réinitialiser le formulaire si nécessaire après fermeture
        this.typeplatForm.reset();
        
        // Réinitialiser le texte du bouton et du titre
        const modaltitle = document.querySelector('.modal-title') as HTMLAreaElement;
        if (modaltitle) modaltitle.innerHTML = 'Ajouter un typeplat';
        
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
    this.store.dispatch(fetchtypeplatData({ page }));
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
      this.typeplatForm.controls['img'].setValue(event[0].dataURL);
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
    this.addTypeplat?.show();
    const modaltitle = document.querySelector('.modal-title') as HTMLAreaElement;
    modaltitle.innerHTML = 'Ajouter un typeplat';
    const modalbtn = document.getElementById('add-btn') as HTMLAreaElement;
    modalbtn.innerHTML = 'Ajouter';
    
    // Réinitialiser le formulaire
    this.typeplatForm.reset();
  }

  // Fermeture de la modal d'ajout
  /*closeAddModal() {
    this.addTypeplat?.hide();
    
    // Réinitialiser le texte du bouton et du titre pour la prochaine utilisation
    const modaltitle = document.querySelector('.modal-title') as HTMLAreaElement;
    if (modaltitle) modaltitle.innerHTML = 'Ajouter un typeplat';
    
    const modalbtn = document.getElementById('add-btn') as HTMLAreaElement;
    if (modalbtn) modalbtn.innerHTML = 'Ajouter';
    
    // Rediriger le focus vers l'élément précédemment actif
    setTimeout(() => {
      if (this.lastActiveElement) {
        this.lastActiveElement.focus();
      }
    }, 100);
    this.typeplatForm.reset();
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
      this.addTypeplat?.hide();
      
      // Réinitialiser le texte du bouton et du titre
      const modaltitle = document.querySelector('.modal-title') as HTMLAreaElement;
      if (modaltitle) modaltitle.innerHTML = 'Ajouter un typeplat';
      
      const modalbtn = document.getElementById('add-btn') as HTMLAreaElement;
      if (modalbtn) modalbtn.innerHTML = 'Ajouter';
    }, 10);
  }

  // Edit Data
  editList(id: any) {
    // Stocker l'élément actif avant d'ouvrir la modal
    this.lastActiveElement = document.activeElement as HTMLElement;
    
    this.addTypeplat?.show();
    const modaltitle = document.querySelector('.modal-title') as HTMLAreaElement;
    modaltitle.innerHTML = 'Modifier le typeplat';
    const modalbtn = document.getElementById('add-btn') as HTMLAreaElement;
    modalbtn.innerHTML = 'Mettre à jour';
    
    // Trouver l'élément par index ou id
    const editData = typeof id === 'number' ? this.typeplats[id] : this.typeplats.find(p => p.id === id);
    
    if (editData) {
      if (this.uploadedFiles.length > 0) {
        this.uploadedFiles = [];  // Vider d'abord
      }
      if (editData.img) {
        this.uploadedFiles.push({ 'dataURL': editData.img, 'name': editData.imgalt, 'size': 1024 });
      }
      this.typeplatForm.patchValue(editData);
    }
  }

  // Add/Update Property
  saveProperty() {
    if (this.typeplatForm.valid) {
      let formValue = { ...this.typeplatForm.value };
  
      // Si `id` est vide, on le supprime avant d'envoyer les données
      if (!formValue.id) {
        delete formValue.id;
      }
  
      // Si l'ID existe, on met à jour les données, sinon on les ajoute
      if (this.typeplatForm.get('id')?.value) {
        // L'ID existe, donc on met à jour
        const updatedData = formValue;
        this.store.dispatch(updatetypeplatData({ updatedData }));
        this.toastService.success('Typebeoin mis à jour avec succès !', 'Succès');
      } else {
        // L'ID est vide, on crée une nouvelle entrée
        const newData = formValue;
        this.store.dispatch(addtypeplatData({ newData }));
        this.toastService.success('Typeplat ajouté avec succès !', 'Succès');
      }
  
      // Réinitialisation de l'interface
      this.uploadedFiles = [];
      this.typeplatForm.reset();
  
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
    this.store.dispatch(deletetypeplatData({ id: id.toString() }));
    this.toastService.success('Type plat supprimé avec succès !', 'Succès');
    // Mettre à jour l'UI
    this.afterDeleteActions();
    return;
  }

  if (this.checkedValGet && this.checkedValGet.length > 0) {
    // Suppression multiple
    console.log("IDs à supprimer :", this.checkedValGet);
    this.store.dispatch(deletemultipletypeplatData({ id: this.checkedValGet.join(',') }));
    this.toastService.success('Type plat supprimées avec succès !', 'Succès');
    
    // Mettre à jour l'UI
    this.afterDeleteActions();
    return;
  }

  // Aucun élément sélectionné
  this.toastService.error('Aucun type plat sélectionné pour suppression.', 'Erreur');
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
    if (this.typeplats) {
      this.typeplats.forEach((item: any) => {
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
    // S'assurer que typeplat est défini
    if (!this.typeplats) return;
    
    // Mettre à jour l'état de tous les éléments
    this.typeplats.forEach((x: any) => {
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
    
    if (this.typeplats && this.typeplats.length > 0) {
      for (let i = 0; i < this.typeplats.length; i++) {
        if (this.typeplats[i] && this.typeplats[i].state === true) {
          checkedVal.push(this.typeplats[i].id);
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
    const sortedArray = [...this.typeplats]; // Create a new array
    sortedArray.sort((a, b) => {
      const res = this.compare(a[column], b[column]);
      return this.direction === 'asc' ? res : -res;
    });
    this.typeplats = sortedArray;
  }
  
  compare(v1: string | number, v2: string | number) {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
  }

  // filterdata
  filterdata() {
    if (this.term) {
      this.typeplats = this.typeplatList.filter((el: any) => 
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

    if (this.term && this.typeplats.length === 0) {
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
  const typeplatData = this.typeplats.find(p => p.id === id);
  
  if (typeplatData) {
    this.selectedTypeplat = typeplatData;
    this.viewTypeplat?.show();
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
    this.viewTypeplat?.hide();
    this.selectedTypeplat = null;
  }, 10);
}

}

