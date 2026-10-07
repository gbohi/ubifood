import { TestBed } from '@angular/core/testing';

import { PlatCategoriesalarieService } from './plat-categoriesalarie.service';

describe('PlatCategoriesalarieService', () => {
  let service: PlatCategoriesalarieService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PlatCategoriesalarieService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
