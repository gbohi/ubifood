import { TestBed } from '@angular/core/testing';

import { TypeequipeService } from './typeequipe.service';

describe('TypeequipeService', () => {
  let service: TypeequipeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TypeequipeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
