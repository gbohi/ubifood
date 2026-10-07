import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListeVehiculeComponent } from './liste-vehicule.component';

describe('ListeVehiculeComponent', () => {
  let component: ListeVehiculeComponent;
  let fixture: ComponentFixture<ListeVehiculeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListeVehiculeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListeVehiculeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
