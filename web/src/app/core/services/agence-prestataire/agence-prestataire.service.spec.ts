import { TestBed } from '@angular/core/testing';

import { AgencePrestataireService } from './agence-prestataire.service';

describe('AgencePrestataireService', () => {
  let service: AgencePrestataireService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AgencePrestataireService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
