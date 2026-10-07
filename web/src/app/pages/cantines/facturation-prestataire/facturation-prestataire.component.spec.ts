import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FacturationPrestataireComponent } from './facturation-prestataire.component';

describe('FacturationPrestataireComponent', () => {
  let component: FacturationPrestataireComponent;
  let fixture: ComponentFixture<FacturationPrestataireComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FacturationPrestataireComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FacturationPrestataireComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
