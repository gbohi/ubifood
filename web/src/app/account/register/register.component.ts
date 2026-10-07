import { Component } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';

// Register Auth
import { AuthenticationService } from 'src/app/core/services/auth.service';
import { UserProfileService } from 'src/app/core/services/user.service';
import { Register } from 'src/app/store/Authentication/authentication.actions';


@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})

// Register Component
export class RegisterComponent {
  // Login Form
  signupForm!: UntypedFormGroup;
  submitted = false;
  successmsg = false;
  error = '';
  // set the current year
  year: number = new Date().getFullYear();

  fieldTextType!: boolean;

  constructor(private formBuilder: UntypedFormBuilder,  public store: Store) { }

  ngOnInit(): void {
    /**
     * Form Validatyion
     */
    this.signupForm = this.formBuilder.group({
      username: ['', [Validators.required]],
      name: ['', [Validators.required]],
      password: ['', Validators.required],
    });
  }

    // convenience getter for easy access to form fields
    get f() { return this.signupForm.controls; }

  /**
   * Register submit form
   */
  onSubmit() {
    this.submitted = true;

    const username = this.f['username'].value;
    const name = this.f['name'].value;
    const password = this.f['password'].value;

    //Dispatch Action
    this.store.dispatch(Register({ username: username, first_name: name, password: password }));
  }

  /**
 * Password Hide/Show
 */
  toggleFieldTextType() {
    this.fieldTextType = !this.fieldTextType;
  }

}
