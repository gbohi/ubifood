import { TestBed } from '@angular/core/testing';

import { EntretienvehiculeService } from './entretienvehicule.service';

describe('EntretienvehiculeService', () => {
  let service: EntretienvehiculeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EntretienvehiculeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
