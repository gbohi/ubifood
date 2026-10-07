import { Injectable } from "@angular/core";
import { of } from 'rxjs';
import { catchError, map, mergeMap, tap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { CrudService } from "src/app/core/services/crud.service";
import { UserService } from "src/app/core/services/user/user.service"; 
import { 
  adduserData,
  adduserDataFailure,
  adduserDataSuccess,

  deleteuserData,
  deleteuserFailure,
  deleteuserSuccess,
  
  deletemultipleuserData,
  deletemultipleuserSuccess,
  deletemultipleuserFailure,
  
  fetchuserData,
  fetchuserFailure,
  fetchuserSuccess,

  updateuserData,
  updateuserDataFailure,
  updateuserDataSuccess
} from "./user.action";

@Injectable()
export class UserEffects {
    
    fetchlistData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(fetchuserData),
            mergeMap(({ page }) =>
                this.UserService.getAllUsers(page || 1).pipe(
                    map((response) => {
                        console.log("Données chargées:", response);
                        return fetchuserSuccess({ response });
                    }),
                    catchError((error) => {
                        console.error("Erreur lors du chargement des données:", error);
                        return of(fetchuserFailure({ error: error.toString() }));
                    })
                )
            )
        )
    );

    // Ajouter une priorité
    addData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(adduserData),
            mergeMap(({ newData }) =>
                this.UserService.createUser(newData).pipe(
                    map((response) => adduserDataSuccess({ newData: response })),
                    catchError((error) => {
                        console.error("Erreur lors de l'ajout:", error);
                        return of(adduserDataFailure({ error: error.toString() }));
                    })
                )
            )
        )
    );

    // Récharger après ajout
    addSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(adduserDataSuccess),
            map(() => fetchuserData({ page: 1 }))  // Retour à la première page après ajout
        )
    );

    // Mettre à jour une priorité
    updateData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(updateuserData),
            mergeMap(({ updatedData }) =>
                this.UserService.updateUser(updatedData).pipe(
                    map(() => updateuserDataSuccess({ updatedData })),
                    catchError((error) => {
                        console.error("Erreur lors de la mise à jour:", error);
                        return of(updateuserDataFailure({ error: error.toString() }));
                    })
                )
            )
        )
    );

    // Récharger après mise à jour
    updateSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(updateuserDataSuccess),
            mergeMap(() => this.UserService.getCurrentPageInfo().pipe(
                map(({ currentPage }) => {
                    console.log("Mise à jour réussie, rechargement de la page", currentPage);
                    // Utiliser explicitement le numéro de page actuel
                    return fetchuserData({ page: currentPage });
                })
            ))
        )
    );

    // Supprimer une priorité
    deleteData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(deleteuserData),
            mergeMap(({ id }) =>
                this.UserService.deleteUser(id).pipe(
                    map(() => deleteuserSuccess({ id })),
                    catchError((error) => {
                        console.error("Erreur lors de la suppression:", error);
                        return of(deleteuserFailure({ error: error.toString() }));
                    })
                )
            )
        )
    );

    // Récharger après suppression d'une priorité
    deleteSingleSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(deleteuserSuccess),
            mergeMap(() => this.UserService.getCurrentPageInfo().pipe(
                map(({ currentPage, totalItems, itemsPerPage }) => {
                    console.log("Suppression réussie, vérification de la pagination");
                    
                    // Calculer le nombre total de pages après suppression
                    const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
                    
                    // Si currentPage > totalPages, revenir à la dernière page disponible
                    if (currentPage > totalPages) {
                        console.log(`Redirection vers la page ${totalPages} (dernière page disponible)`);
                        return fetchuserData({ page: totalPages > 0 ? totalPages : 1 });
                    } else {
                        // Sinon, rester sur la page actuelle
                        console.log(`Maintien sur la page ${currentPage}`);
                        return fetchuserData({ page: currentPage });
                    }
                }),
                catchError(error => {
                    console.error("Erreur lors de la vérification de pagination:", error);
                    // En cas d'erreur, charger la première page
                    return of(fetchuserData({ page: 1 }));
                })
            ))
        )
    );

    // Supprimer plusieurs priorités
    deleteMultipleData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(deletemultipleuserData),
            mergeMap(({ id }) => {
                // S'assurer que l'ID est bien formaté
                if (!id || id.trim() === '') {
                    console.error("Aucun ID valide pour la suppression multiple");
                    return of(deletemultipleuserFailure({ error: "Aucun ID valide" }));
                }
                
                const idArray = id.split(',')
                    .filter(idStr => idStr.trim() !== '')
                    .map(idStr => parseInt(idStr.trim()))
                    .filter(id => !isNaN(id));
                
                console.log("Suppression multiple des IDs:", idArray);
                
                if (idArray.length === 0) {
                    console.error("Aucun ID valide après conversion");
                    return of(deletemultipleuserFailure({ error: "Aucun ID valide après conversion" }));
                }
                
                return this.UserService.deleteMultipleUser(idArray).pipe(
                    map(() => deletemultipleuserSuccess({ id })),
                    catchError((error) => {
                        console.error("Erreur lors de la suppression multiple:", error);
                        return of(deletemultipleuserFailure({ error: error.toString() }));
                    })
                );
            })
        )
    );

    // Récharger après suppression multiple
    deletemultipleSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(deletemultipleuserSuccess),
            mergeMap(({ id }) => {
                const deletedCount = id.split(',').filter(i => i.trim() !== '').length;
                
                return this.UserService.getCurrentPageInfo().pipe(
                    map(({ currentPage, totalItems, itemsPerPage }) => {
                        console.log("Suppression multiple réussie, vérification de la pagination");
                        console.log(`Items supprimés: ${deletedCount}, totalItems: ${totalItems}, page actuelle: ${currentPage}`);
                        
                        // Calculer le nombre total de pages après suppression multiple
                        const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
                        
                        // Si currentPage > totalPages, revenir à la dernière page disponible
                        if (currentPage > totalPages) {
                            console.log(`Redirection vers la page ${totalPages} (dernière page disponible)`);
                            return fetchuserData({ page: totalPages > 0 ? totalPages : 1 });
                        } else {
                            // Sinon, rester sur la page actuelle
                            console.log(`Maintien sur la page ${currentPage}`);
                            return fetchuserData({ page: currentPage });
                        }
                    }),
                    catchError(error => {
                        console.error("Erreur lors de la vérification de pagination:", error);
                        // En cas d'erreur, charger la première page
                        return of(fetchuserData({ page: 1 }));
                    })
                );
            })
        )
    );

    constructor(
        private actions$: Actions,
        private CrudService: CrudService,
        private UserService: UserService
    ) { }
}