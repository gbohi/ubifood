import { TestBed } from '@angular/core/testing';

import { PlatPrestataireService } from './plat-prestataire.service';

describe('PlatPrestataireService', () => {
  let service: PlatPrestataireService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PlatPrestataireService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
