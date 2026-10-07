import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlanningmenuComponent } from './planningmenu.component';

describe('PlanningmenuComponent', () => {
  let component: PlanningmenuComponent;
  let fixture: ComponentFixture<PlanningmenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanningmenuComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlanningmenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
