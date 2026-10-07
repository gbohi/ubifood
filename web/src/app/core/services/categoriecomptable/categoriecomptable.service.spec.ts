import { TestBed } from '@angular/core/testing';

import { CategoriecomptableService } from './categoriecomptable.service';

describe('CategoriecomptableService', () => {
  let service: CategoriecomptableService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CategoriecomptableService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
