import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatutComponent } from './statut.component';

describe('StatutComponent', () => {
  let component: StatutComponent;
  let fixture: ComponentFixture<StatutComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatutComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StatutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
