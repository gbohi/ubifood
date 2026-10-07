import { TestBed } from '@angular/core/testing';

import { SimulationsalaireService } from './simulationsalaire.service';

describe('SimulationsalaireService', () => {
  let service: SimulationsalaireService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SimulationsalaireService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
