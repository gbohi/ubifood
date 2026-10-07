import { Component, OnInit } from '@angular/core';
import { WebNotificationService } from './core/services/web-notification.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {

  constructor(
    private webNotif: WebNotificationService,
    // ... vos autres injections existantes
  ) {}

  ngOnInit(): void {
    // ✅ Initialiser FCM Web au démarrage
    this.webNotif.init();

    // ... votre code existant
  }
}
