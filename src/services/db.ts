import { supabaseAdapter } from "@grammyjs/storage-supabase";
import { createClient } from '@supabase/supabase-js';
import { CONFIG, USERLIST } from "../bot";


const TableName = 'session'

const TableName2 = 'settings'

// supabase instance
const supabase = createClient(String(process.env.DB_URL), String(process.env.DB_KEY));

//create storage
export const storage = supabaseAdapter<USERLIST>({
  supabase,
  table: TableName, // the defined table name you want to use to store your session
});

//create storage
export const storage2 = supabaseAdapter<CONFIG>({
  supabase,
  table: TableName2, // the defined table name you want to use to store your session
});