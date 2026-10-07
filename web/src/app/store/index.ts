import { DashboardCantineReducer, DashboardCantineState } from './DashboardCantine/dashboard-cantine.reducer';
import { platCategoriesalarieReducer, PlatCategoriesalarieState } from './PlatCategoriesalarie/plat-categoriesalarie.reducer';
import { platPrestataireReducer, PlatPrestataireState } from './PlatPrestataire/plat-prestataire.reducer';
import { ActionReducerMap } from "@ngrx/store";
import { AuthenticationState, authenticationReducer } from "./Authentication/authentication.reducer";
import { LayoutState, layoutReducer } from "./layouts/layout-reducers";

//UBI
import { PrioriteReducer, PrioriteState } from "./Priorite/priorite.reducer";
import { EtatReducer, EtatState } from "./Etat/etat.reducer";
import { StatutReducer, StatutState } from "./Statut/statut.reducer";
import { AgenceReducer, AgenceState } from "./Agence/agence.reducer";
import { DepartementReducer, DepartementState } from "./Departement/departement.reducer";
import { TypebesoinReducer, TypebesoinState } from "./Typebesoin/typebesoin.reducer";
import { RoleReducer, RoleState } from "./Role/role.reducer";
import { UserReducer, UserState } from "./User/user.reducer";
import { BesoinReducer, BesoinState } from "./Besoin/besoin.reducer";
import { TypeplatReducer, TypeplatState } from "./Typeplat/typeplat.reducer";
import { PlatReducer, PlatState } from "./Plat/plat.reducer";
import { TypevehiculeReducer, TypevehiculeState } from "./Typevehicule/typevehicule.reducer";
import { VehiculeReducer, VehiculeState } from "./Vehicule/vehicule.reducer";
import { EntretienvehiculeReducer, EntretienvehiculeState } from "./Entretienvehicule/entretienvehicule.reducer";
import { dashboardentretienvehiculeReducer, DashboardEntretienVehiculeState } from "./Dashboardentretienvehicule/dashboardentretienvehicule.reducer";
import { DashboardSimulationReducer, DashboardSimulationState } from "./Dashboardsimulation/dashboardsimulation.reducer";
import { CategoriecomptableReducer, CategoriecomptableState } from "./Categoriecomptable/categoriecomptable.reducer";
import { ClassecomptableReducer, ClassecomptableState } from "./Classecomptable/classecomptable.reducer";
import { PostereportingReducer, PostereportingState } from "./Postereporting/postereporting.reducer";
import { ComptecomptableReducer, ComptecomptableState } from "./Comptecomptable/comptecomptable.reducer";
import { MenuReducer, MenuState } from "./Menu/menu.reducer";
import { TypeequipeReducer, TypeequipeState } from "./Typeequipe/typeequipe.reducer";
import { commandeReducer, CommandeState } from "./Commande/commande.reducer";
import { FonctionReducer, FonctionState } from "./Fonction/fonction.reducer";
import { CategoriesalarieReducer, CategoriesalarieState } from "./Categoriesalarie/categoriesalarie.reducer";
import { PrestataireReducer, PrestataireState } from "./Prestataire/prestataire.reducer";
import { agencePrestataireReducer, AgencePrestataireState } from './AgencePrestataire/agence-prestataire.reducer';
import { PosteReducer, PosteState } from './Poste/poste.reducer';
import { userServiceReducer, UserServiceState } from './UserService/user-service.reducer';
import { userAgenceReducer, UserAgenceState } from './UserAgence/user-agence.reducer';
import { userPosteReducer, UserPosteState } from './UserPoste/user-poste.reducer';
import { userCategoriesalarieReducer, UserCategoriesalarieState } from './UserCategoriesalarie/user-categoriesalarie.reducer';
import { userAllergieReducer, UserAllergieState } from './UserAllergie/user-allergie.reducer';


export interface RootReducerState {
    layout: LayoutState,
    auth: AuthenticationState;
    priorite: PrioriteState;  // Ajout de Priorite
    etat: EtatState;
    statut: StatutState;
    agence: AgenceState;
    departement: DepartementState;
    typebesoin: TypebesoinState;
    role: RoleState;
    user: UserState;
    besoin: BesoinState;
    typeplat: TypeplatState;
    plat: PlatState;
    typevehicule: TypevehiculeState;
    vehicule: VehiculeState;
    entretienvehicule: EntretienvehiculeState;
    dashboardentretienvehicule: DashboardEntretienVehiculeState;
    dashboardsimulation: DashboardSimulationState;
    categoriecomptable: CategoriecomptableState;
    classecomptable: ClassecomptableState;
    postereporting: PostereportingState;
    comptecomptable: ComptecomptableState;
    menu: MenuState;
    typeequipe: TypeequipeState,
    commande: CommandeState,
    fonction: FonctionState,
    categoriesalarie: CategoriesalarieState,
    prestataire: PrestataireState,
    platPrestataire: PlatPrestataireState,
    agencePrestataire: AgencePrestataireState,
    platCategoriesalarie: PlatCategoriesalarieState,
    poste: PosteState,
    userService: UserServiceState,
    userAgence: UserAgenceState,
    userPoste: UserPosteState,
    userCategoriesalarie: UserCategoriesalarieState,
    userAllergie: UserAllergieState
    dashboardCantine: DashboardCantineState
}

export const rootReducer: ActionReducerMap<RootReducerState> = {
    layout: layoutReducer,
    auth: authenticationReducer,
    priorite: PrioriteReducer,
    etat: EtatReducer,
    statut: StatutReducer,
    agence: AgenceReducer,
    departement: DepartementReducer,
    typebesoin: TypebesoinReducer,
    role: RoleReducer,
    user: UserReducer,
    besoin: BesoinReducer,
    typeplat: TypeplatReducer,
    plat: PlatReducer,
    typevehicule: TypevehiculeReducer,
    vehicule: VehiculeReducer,
    entretienvehicule: EntretienvehiculeReducer,
    dashboardentretienvehicule: dashboardentretienvehiculeReducer,
    dashboardsimulation: DashboardSimulationReducer,
    categoriecomptable: CategoriecomptableReducer,
    classecomptable: ClassecomptableReducer,
    postereporting: PostereportingReducer,
    comptecomptable: ComptecomptableReducer,
    menu: MenuReducer,
    typeequipe: TypeequipeReducer,
    commande: commandeReducer,
    fonction: FonctionReducer,
    categoriesalarie: CategoriesalarieReducer,
    prestataire: PrestataireReducer,
    platPrestataire: platPrestataireReducer,
    agencePrestataire: agencePrestataireReducer,
    platCategoriesalarie: platCategoriesalarieReducer,
    poste: PosteReducer,
    userService: userServiceReducer,
    userAgence: userAgenceReducer,
    userPoste: userPosteReducer,
    userCategoriesalarie: userCategoriesalarieReducer,
    userAllergie: userAllergieReducer,
    dashboardCantine: DashboardCantineReducer
}