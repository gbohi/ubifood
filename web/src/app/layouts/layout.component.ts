import { Component } from '@angular/core';
import { RootReducerState } from '../store';
import { Store } from '@ngrx/store';

/**
 * Coquille de l'espace connecté : seule la mise en page verticale
 * (menu latéral + barre du haut) est utilisée.
 * Les attributs data-* posés sur <html> pilotent les styles du thème.
 */
@Component({
  selector: 'app-layout',
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {

  constructor(private store: Store<RootReducerState>) { }

  ngOnInit() {
    this.store.select('layout').subscribe((data) => {
      document.documentElement.setAttribute('data-layout', data.LAYOUT);
      document.documentElement.setAttribute('data-sidebar', data.SIDEBAR_COLOR);
      document.documentElement.setAttribute('data-sidebar-size', data.SIDEBAR_SIZE);
      document.documentElement.setAttribute('data-bs-theme', data.LAYOUT_MODE);
      document.documentElement.setAttribute('data-layout-width', data.LAYOUT_WIDTH);
      document.documentElement.setAttribute('data-sidebar-image', data.SIDEBAR_IMAGE);
      document.documentElement.setAttribute('data-layout-position', data.LAYOUT_POSITION);
      document.documentElement.setAttribute('data-layout-style', data.SIDEBAR_VIEW);
      document.documentElement.setAttribute('data-topbar', data.TOPBAR);
      document.documentElement.setAttribute('data-preloader', data.DATA_PRELOADER);
      document.documentElement.setAttribute('data-theme', data.LAYOUT_THEME);

      if (data.DATA_PRELOADER == 'enable') {
        setTimeout(() => {
          const preloader = document.getElementById('preloader');
          if (preloader) {
            preloader.style.opacity = '0';
            preloader.style.visibility = 'hidden';
          }
        }, 1000);
      }
    });
  }
}
