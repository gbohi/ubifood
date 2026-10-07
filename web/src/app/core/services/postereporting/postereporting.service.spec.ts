import { TestBed } from '@angular/core/testing';

import { PostereportingService } from './postereporting.service';

describe('PostereportingService', () => {
  let service: PostereportingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PostereportingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
