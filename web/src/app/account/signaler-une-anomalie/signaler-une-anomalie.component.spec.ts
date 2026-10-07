import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SignalerUneAnomalieComponent } from './signaler-une-anomalie.component';

describe('SignalerUneAnomalieComponent', () => {
  let component: SignalerUneAnomalieComponent;
  let fixture: ComponentFixture<SignalerUneAnomalieComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignalerUneAnomalieComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SignalerUneAnomalieComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
