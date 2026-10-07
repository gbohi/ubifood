import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CategoriecomptableComponent } from './categoriecomptable.component';

describe('CategoriecomptableComponent', () => {
  let component: CategoriecomptableComponent;
  let fixture: ComponentFixture<CategoriecomptableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoriecomptableComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CategoriecomptableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
