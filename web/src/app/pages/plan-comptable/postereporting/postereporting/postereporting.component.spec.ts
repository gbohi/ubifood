import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PostereportingComponent } from './postereporting.component';

describe('PostereportingComponent', () => {
  let component: PostereportingComponent;
  let fixture: ComponentFixture<PostereportingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PostereportingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PostereportingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
