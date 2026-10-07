import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PrioriteComponent } from './priorite.component';

describe('PrioriteComponent', () => {
  let component: PrioriteComponent;
  let fixture: ComponentFixture<PrioriteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrioriteComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PrioriteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
