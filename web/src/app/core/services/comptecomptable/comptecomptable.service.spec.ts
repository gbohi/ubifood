import { TestBed } from '@angular/core/testing';

import { ComptecomptableService } from './comptecomptable.service';

describe('ComptecomptableService', () => {
  let service: ComptecomptableService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ComptecomptableService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
