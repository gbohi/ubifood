import { TestBed } from '@angular/core/testing';

import { TypeplatService } from './typeplat.service';

describe('TypeplatService', () => {
  let service: TypeplatService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TypeplatService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
