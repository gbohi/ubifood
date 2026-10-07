import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GenerationBancaireComponent } from './generation-bancaire.component';

describe('GenerationBancaireComponent', () => {
  let component: GenerationBancaireComponent;
  let fixture: ComponentFixture<GenerationBancaireComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GenerationBancaireComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GenerationBancaireComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
