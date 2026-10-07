import { TestBed } from '@angular/core/testing';

import { UserPosteService } from './user-poste.service';

describe('UserPosteService', () => {
  let service: UserPosteService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UserPosteService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
