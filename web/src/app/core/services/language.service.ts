import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { CookieService } from 'ngx-cookie-service';

@Injectable({ providedIn: 'root' })
export class LanguageService {

  // L'application n'est traduite qu'en français (assets/i18n/fr.json) :
  // les autres fichiers de langue du modèle ne contiennent pas les menus Ubifood.
  public languages: string[] = ['fr'];

  constructor(public translate: TranslateService, private cookieService: CookieService) {
    this.translate.addLangs(this.languages);
    this.translate.setDefaultLang('fr');
    this.translate.use('fr');
  }

  /***
   * Cookie Language set
   */
  public setLanguage(lang: any) {
    this.translate.use(lang);
    this.cookieService.set('lang', lang);
  }

}
