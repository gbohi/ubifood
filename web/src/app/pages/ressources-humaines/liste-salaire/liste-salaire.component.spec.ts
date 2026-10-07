import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListeSalaireComponent } from './liste-salaire.component';

describe('ListeSalaireComponent', () => {
  let component: ListeSalaireComponent;
  let fixture: ComponentFixture<ListeSalaireComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListeSalaireComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListeSalaireComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
