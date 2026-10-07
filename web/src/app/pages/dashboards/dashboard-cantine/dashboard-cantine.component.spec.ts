import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardCantineComponent } from './dashboard-cantine.component';

describe('DashboardCantineComponent', () => {
  let component: DashboardCantineComponent;
  let fixture: ComponentFixture<DashboardCantineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardCantineComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardCantineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
