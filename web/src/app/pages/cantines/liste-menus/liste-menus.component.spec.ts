import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListeMenusComponent } from './liste-menus.component';

describe('ListeMenusComponent', () => {
  let component: ListeMenusComponent;
  let fixture: ComponentFixture<ListeMenusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListeMenusComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListeMenusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
