import { TestBed } from '@angular/core/testing';

import { UserAgenceService } from './user-agence.service';

describe('UserAgenceService', () => {
  let service: UserAgenceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UserAgenceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
