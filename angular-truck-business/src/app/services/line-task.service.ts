import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type LineTaskPayload = {
  title: string;
  when: string;
  where: string;
  note?: string;
  date?: string;        // 'YYYY-MM-DD'
  employeeId?: string;  // EMP001 ...
};

export type LineTaskResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

@Injectable({ providedIn: 'root' })
export class LineTaskService {
  private url = '/api/line/sendTask';
  constructor(private http: HttpClient) {}
  sendTask(payload: LineTaskPayload): Observable<LineTaskResponse> {
    return this.http.post<LineTaskResponse>(this.url, payload);
  }
}
