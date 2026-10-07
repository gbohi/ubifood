import { TestBed } from '@angular/core/testing';

import { TypebesoinService } from './typebesoin.service';

describe('TypebesoinService', () => {
  let service: TypebesoinService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TypebesoinService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
