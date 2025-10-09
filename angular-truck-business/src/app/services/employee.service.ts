import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type Employee = { id: string; name: string; position?: string };

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  constructor(private http: HttpClient) {}
  getAll(): Observable<Employee[]> {
    return this.http.get<Employee[]>('/api/employees');
  }
}
