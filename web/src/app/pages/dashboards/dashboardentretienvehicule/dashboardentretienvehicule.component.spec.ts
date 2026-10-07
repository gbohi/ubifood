import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardentretienvehiculeComponent } from './dashboardentretienvehicule.component';

describe('DashboardentretienvehiculeComponent', () => {
  let component: DashboardentretienvehiculeComponent;
  let fixture: ComponentFixture<DashboardentretienvehiculeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardentretienvehiculeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardentretienvehiculeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
