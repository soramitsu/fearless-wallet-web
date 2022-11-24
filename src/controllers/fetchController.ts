import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import fetchAdapter from '@vespaiach/axios-fetch-adapter';

export class Http {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      adapter: fetchAdapter,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  static create() {
    return new Http();
  }

  public async get<T>(url: string, config: AxiosRequestConfig = {}): Promise<T> {
    const { data } = await this.http.get<T>(url, config);

    return data;
  }

  public async post<T>(url: string, data: unknown, config: AxiosRequestConfig = {}): Promise<T> {
    const { data: responseData } = await this.http.post<T>(url, data, config);

    return responseData;
  }

  public async put<T>(url: string, data: unknown, config: AxiosRequestConfig = {}): Promise<T> {
    const { data: responseData } = await this.http.put<T>(url, data, config);

    return responseData;
  }

  public async patch<T>(url: string, data: unknown, config: AxiosRequestConfig = {}): Promise<T> {
    const { data: responseData } = await this.http.patch<T>(url, data, config);

    return responseData;
  }

  public async delete<T>(url: string, config: AxiosRequestConfig = {}): Promise<T> {
    const { data } = await this.http.delete<T>(url, config);

    return data;
  }
}
