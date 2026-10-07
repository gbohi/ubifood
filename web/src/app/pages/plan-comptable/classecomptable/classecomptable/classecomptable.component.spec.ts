import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClassecomptableComponent } from './classecomptable.component';

describe('ClassecomptableComponent', () => {
  let component: ClassecomptableComponent;
  let fixture: ComponentFixture<ClassecomptableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClassecomptableComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClassecomptableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
