import { TestBed } from '@angular/core/testing';

import { UserCategoriesalarieService } from './user-categoriesalarie.service';

describe('UserCategoriesalarieService', () => {
  let service: UserCategoriesalarieService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UserCategoriesalarieService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
