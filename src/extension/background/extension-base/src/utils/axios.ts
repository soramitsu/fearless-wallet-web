import fetchAdapter from '@vespaiach/axios-fetch-adapter';
import axiosBase from 'axios';

export const axios = axiosBase.create({
  adapter: fetchAdapter,
});
