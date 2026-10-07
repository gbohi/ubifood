import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImporterSalaireComponent } from './importer-salaire.component';

describe('ImporterSalaireComponent', () => {
  let component: ImporterSalaireComponent;
  let fixture: ComponentFixture<ImporterSalaireComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImporterSalaireComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ImporterSalaireComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
