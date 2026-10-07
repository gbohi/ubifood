import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FacturationCommandeComponent } from './facturation-commande.component';

describe('FacturationCommandeComponent', () => {
  let component: FacturationCommandeComponent;
  let fixture: ComponentFixture<FacturationCommandeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FacturationCommandeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FacturationCommandeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
