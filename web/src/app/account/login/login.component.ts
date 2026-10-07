// src/app/account/auth/login/login.component.ts
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
    // Déjà connecté → aller à l'accueil directement
    if (this.tokenStorage.getAccessToken()) {
      this.router.navigate(['/']);
      return;
    }

    this.loginForm = this.formBuilder.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]],
    });

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

      const returnUrl = this.route.snapshot.queryParams['returnUrl'];
      const destination = (returnUrl && !returnUrl.includes('/auth/login'))
        ? returnUrl
        : '/';
      this.router.navigate([destination]);
    });
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
