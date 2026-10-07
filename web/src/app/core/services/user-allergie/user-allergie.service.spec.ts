import { TestBed } from '@angular/core/testing';

import { UserAllergieService } from './user-allergie.service';

describe('UserAllergieService', () => {
  let service: UserAllergieService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UserAllergieService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
