import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListeEntretienComponent } from './liste-entretien.component';

describe('ListeEntretienComponent', () => {
  let component: ListeEntretienComponent;
  let fixture: ComponentFixture<ListeEntretienComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListeEntretienComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListeEntretienComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
