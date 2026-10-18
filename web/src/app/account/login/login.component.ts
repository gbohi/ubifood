// src/app/account/login/login.component.ts
import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { login, loginFailure, loginSuccess } from 'src/app/store/Authentication/authentication.actions';
import { WebNotificationService } from 'src/app/core/services/web-notification.service'; // ✅ AJOUTÉ

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {

  loginForm!: UntypedFormGroup;
  submitted = false;
  fieldTextType = false;
  isLoading = false;
  errorMessage: string | null = null;

  private destroyRef = inject(DestroyRef);

  constructor(
    private formBuilder: UntypedFormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private store: Store,
    private actions$: Actions,
    private tokenStorage: TokenStorageService,
    private webNotif: WebNotificationService, // ✅ AJOUTÉ
  ) {}

  ngOnInit(): void {
    // Formulaire créé d'abord : le gabarit en a besoin même en cas de redirection
    this.loginForm = this.formBuilder.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]],
    });

    // Déjà connecté → aller à la page demandée (ou à l'accueil)
    if (this.tokenStorage.getAccessToken()) {
      this.router.navigateByUrl(this.destinationApresConnexion());
      return;
    }

    // Erreur de connexion → afficher le message
    this.actions$.pipe(
      ofType(loginFailure),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(({ error }) => {
      this.errorMessage = error;
      this.isLoading = false;
    });

    // Connexion réussie → enregistrer token FCM + rediriger
    this.actions$.pipe(
      ofType(loginSuccess),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      // ✅ Demander permission notifications et envoyer token FCM au backend
      // Token JWT disponible à ce stade → l'envoi au backend fonctionnera
      this.webNotif.requestPermissionAndSaveToken();

      this.router.navigateByUrl(this.destinationApresConnexion());
    });
  }

  /**
   * Page demandée avant la connexion : uniquement une adresse interne
   * (« /… » mais pas « //… », qui pointerait vers un autre site).
   */
  private destinationApresConnexion(): string {
    const url: string = this.route.snapshot.queryParams['returnUrl'] || '';
    const interne = url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/auth/');
    return interne ? url : '/';
  }

  get f() { return this.loginForm.controls; }

  onSubmit(): void {
    this.submitted = true;
    this.errorMessage = null;
    if (this.loginForm.invalid) return;
    this.isLoading = true;
    this.store.dispatch(login({
      username: this.f['username'].value,
      password: this.f['password'].value,
    }));
  }

  toggleFieldTextType(): void {
    this.fieldTextType = !this.fieldTextType;
  }
}
