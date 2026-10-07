export interface DashboardVehiculeMensuel {
  immatriculation: string;
  mois: { [key: number]: number };
  total: number;
}

export interface DashboardAgence {
  agence: string;
  vehicules: DashboardVehiculeMensuel[];
  total_agence_mois: { [key: number]: number };
  total_agence_global: number;
}

export interface DashboardEntretienVehiculeResponse {
  donnees: DashboardAgence[];
  total_global_mois: { [key: number]: number };
  total_global: number;
}


//export type DashboardEntretienVehiculeResponse = DashboardAgence[];
