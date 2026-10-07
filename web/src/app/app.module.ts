import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClient, HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AngularFireModule } from '@angular/fire/compat';
import { AngularFireAuthModule } from '@angular/fire/compat/auth';
import { AppRoutingModule } from './app-routing.module';
import { LayoutsModule } from './layouts/layouts.module';
import { ToastrModule } from 'ngx-toastr';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';

import { AppComponent } from './app.component';
import { AuthlayoutComponent } from './authlayout/authlayout.component';
import { environment } from 'src/environments/environment';
import { rootReducer } from './store';

// ── Interceptors ────────────────────────────────────────────────
import { ErrorInterceptor } from './core/helpers/error.interceptor';
// (JwtInterceptor du template supprimé : il ne faisait plus rien)
/**
 * CORRIGÉ : AuthInterceptor était absent des providers
 * → aucun token JWT n'était injecté sur les requêtes vers /api/api/...
 * → toutes les requêtes après login retournaient 401 Unauthorized
 */
import { AuthInterceptor } from './core/helpers/auth.interceptor';

// ── Effects ─────────────────────────────────────────────────────
import { AuthenticationEffects } from './store/Authentication/authentication.effects';

// ── Effects — Ubici ─────────────────────────────────────────────
import { PrioriteEffects } from './store/Priorite/priorite.effects';
import { EtatEffects } from './store/Etat/etat.effects';
import { StatutEffects } from './store/Statut/statut.effects';
import { AgenceEffects } from './store/Agence/agence.effects';
import { DepartementEffects } from './store/Departement/departement.effects';
import { TypebesoinEffects } from './store/Typebesoin/typebesoin.effects';
import { RoleEffects } from './store/Role/role.effects';
import { UserEffects } from './store/User/user.effects';
import { BesoinEffects } from './store/Besoin/besoin.effects';
import { TypeplatEffects } from './store/Typeplat/typeplat.effects';
import { PlatEffects } from './store/Plat/plat.effects';
import { TypevehiculeEffects } from './store/Typevehicule/typevehicule.effects';
import { VehiculeEffects } from './store/Vehicule/vehicule.effects';
import { EntretienvehiculeEffects } from './store/Entretienvehicule/entretienvehicule.effects';
import { DashboardEntretienVehiculeEffects } from './store/Dashboardentretienvehicule/dashboardentretienvehicule.effects';
import { DashboardSimulationEffects } from './store/Dashboardsimulation/dashboardsimulation.effects';
import { CategoriecomptableEffects } from './store/Categoriecomptable/categoriecomptable.effects';
import { ClassecomptableEffects } from './store/Classecomptable/classecomptable.effects';
import { PostereportingEffects } from './store/Postereporting/postereporting.effects';
import { ComptecomptableEffects } from './store/Comptecomptable/comptecomptable.effects';
import { MenuEffects } from './store/Menu/menu.effects';
import { TypeequipeEffects } from './store/Typeequipe/typeequipe.effects';
import { CommandeEffects } from './store/Commande/commande.effects';
import { FonctionEffects } from './store/Fonction/fonction.effects';
import { CategoriesalarieEffects } from './store/Categoriesalarie/categoriesalarie.effects';
import { PrestataireEffects } from './store/Prestataire/prestataire.effects';
import { PlatPrestataireEffects } from './store/PlatPrestataire/plat-prestataire.effects';
import { AgencePrestataireEffects } from './store/AgencePrestataire/agence-prestataire.effects';
import { PlatCategoriesalarieEffects } from './store/PlatCategoriesalarie/plat-categoriesalarie.effects';
import { PosteEffects } from './store/Poste/poste.effects';
import { UserServiceEffects } from './store/UserService/user-service.effects';
import { UserAgenceEffects } from './store/UserAgence/user-agence.effects';
import { UserPosteEffects } from './store/UserPoste/user-poste.effects';
import { UserCategoriesalarieEffects } from './store/UserCategoriesalarie/user-categoriesalarie.effects';
import { UserAllergieEffects } from './store/UserAllergie/user-allergie.effects';
import { DashboardCantineEffects } from './store/DashboardCantine/dashboard-cantine.effects';

export function createTranslateLoader(http: HttpClient): any {
  return new TranslateHttpLoader(http, 'assets/i18n/', '.json');
}

@NgModule({
  declarations: [
    AppComponent,
    AuthlayoutComponent
  ],
  bootstrap: [AppComponent],
  imports: [
    TranslateModule.forRoot({
      defaultLanguage: 'en',
      loader: {
        provide: TranslateLoader,
        useFactory: createTranslateLoader,
        deps: [HttpClient]
      }
    }),
    StoreModule.forRoot(rootReducer),
    StoreDevtoolsModule.instrument({
      maxAge: 25,
      logOnly: environment.production,
    }),
    EffectsModule.forRoot([
      AuthenticationEffects,
      PrioriteEffects,
      EtatEffects,
      StatutEffects,
      AgenceEffects,
      DepartementEffects,
      TypebesoinEffects,
      RoleEffects,
      UserEffects,
      BesoinEffects,
      TypeplatEffects,
      PlatEffects,
      TypevehiculeEffects,
      VehiculeEffects,
      EntretienvehiculeEffects,
      DashboardEntretienVehiculeEffects,
      DashboardSimulationEffects,
      CategoriecomptableEffects,
      ClassecomptableEffects,
      PostereportingEffects,
      ComptecomptableEffects,
      MenuEffects,
      TypeequipeEffects,
      CommandeEffects,
      FonctionEffects,
      CategoriesalarieEffects,
      PrestataireEffects,
      PlatPrestataireEffects,
      AgencePrestataireEffects,
      PlatCategoriesalarieEffects,
      PosteEffects,
      UserServiceEffects,
      UserAgenceEffects,
      UserPosteEffects,
      UserCategoriesalarieEffects,
      UserAllergieEffects,
      DashboardCantineEffects
    ]),
    AngularFireModule.initializeApp(environment.firebaseConfig),
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    LayoutsModule,
    ToastrModule.forRoot(),
    FormsModule,
    ReactiveFormsModule,
    AngularFireAuthModule,
  ],
  providers: [
    /**
     * ORDRE DES INTERCEPTEURS — critique, s'exécutent dans cet ordre
     * sur la requête sortante, en ordre inverse sur la réponse.
     *
     * 1. AuthInterceptor       → injecte le token Django JWT, refresh sur 401
     * 2. ErrorInterceptor      → extrait un message lisible des erreurs DRF
     *
     * L'intercepteur « fake backend » du template (faux utilisateurs
     * admin/123456 en localStorage) a été retiré.
     */
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
    provideHttpClient(withInterceptorsFromDi()),
  ]
})
export class AppModule {}
