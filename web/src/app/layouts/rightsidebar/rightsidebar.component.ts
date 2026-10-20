import { Component, ChangeDetectionStrategy } from '@angular/core';

/**
 * Bouton « retour en haut » et préchargeur de page.
 * (Le panneau de personnalisation du thème du modèle a été retiré.)
 */
@Component({
  selector: 'app-rightsidebar',
  templateUrl: './rightsidebar.component.html',
  styleUrls: ['./rightsidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RightsidebarComponent {

  topFunction() {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }
}
