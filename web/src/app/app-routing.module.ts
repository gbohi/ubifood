import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Component
import { LayoutComponent } from './layouts/layout.component';
import { AuthlayoutComponent } from './authlayout/authlayout.component';
import { AuthGuard } from './core/guards/auth.guard';
import { PageIntrouvableComponent } from './page-introuvable/page-introuvable.component';
import { TelechargerComponent } from './telecharger/telecharger.component';

const routes: Routes = [
  // Page publique (sans connexion) : téléchargement de l'application mobile
  { path: 'telecharger', component: TelechargerComponent, title: 'Télécharger UbiFood' },
  { path: 'application', redirectTo: 'telecharger', pathMatch: 'full' },
  { path: '', component: LayoutComponent, loadChildren: () => import('./pages/pages.module').then(m => m.PagesModule), canActivate: [AuthGuard]  },
  { path: 'auth', component: AuthlayoutComponent, loadChildren: () => import('./account/account.module').then(m => m.AccountModule) },
  // Adresse inconnue : vraie page 404 (au lieu d'un retour silencieux à l'accueil)
  { path: '**', component: PageIntrouvableComponent, title: 'Page introuvable | UbiFood' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'top' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
