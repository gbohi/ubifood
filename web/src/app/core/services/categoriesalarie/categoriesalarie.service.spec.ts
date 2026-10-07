import { TestBed } from '@angular/core/testing';

import { CategoriesalarieService } from './categoriesalarie.service';

describe('CategoriesalarieService', () => {
  let service: CategoriesalarieService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CategoriesalarieService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
