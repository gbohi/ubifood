import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CategoriesalarieComponent } from './categoriesalarie.component';

describe('CategoriesalarieComponent', () => {
  let component: CategoriesalarieComponent;
  let fixture: ComponentFixture<CategoriesalarieComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoriesalarieComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CategoriesalarieComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
